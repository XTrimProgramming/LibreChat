const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { EToolResources } = require('librechat-data-provider');

const mockEnsureTable = jest.fn();
const mockFindFileByHash = jest.fn();
const mockUpsertFile = jest.fn();
const mockFindOne = jest.fn();
const mockAddAgentResourceFile = jest.fn();
const mockRemoveAgentResourceFiles = jest.fn();
const mockCreateFile = jest.fn();
const mockHandleFileUpload = jest.fn();
const mockGetStrategyFunctions = jest.fn(() => ({
  handleFileUpload: mockHandleFileUpload,
  deleteFile: jest.fn(),
  handleImageUpload: jest.fn(),
  saveBuffer: jest.fn(),
  saveURL: jest.fn(),
}));

jest.mock('./postgresFileStore', () => ({
  ensureTable: mockEnsureTable,
  findFileByHash: mockFindFileByHash,
  upsertFile: mockUpsertFile,
}));

jest.mock('~/db/models', () => ({
  File: {
    findOne: mockFindOne,
  },
}));

jest.mock('~/models/Agent', () => ({
  addAgentResourceFile: mockAddAgentResourceFile,
  removeAgentResourceFiles: mockRemoveAgentResourceFiles,
}));

jest.mock('~/models', () => ({
  createFile: mockCreateFile,
  updateFileUsage: jest.fn(),
  deleteFiles: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: mockGetStrategyFunctions,
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn().mockResolvedValue({
    openai: { beta: { assistants: { files: { del: jest.fn() } } } },
  }),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn().mockResolvedValue(true),
}));

const testPdfAsset = path.resolve(
  __dirname,
  '../../../../uploads/temp/695bf183d52e7443e103895d/Starbucks-Fiscal-2024-Global-Impact-Report.pdf',
);

const tempDirs = new Set();

const copyTestAsset = async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'librechat-test-upload-'));
  tempDirs.add(tmpDir);
  const destination = path.join(tmpDir, path.basename(testPdfAsset));
  await fs.copyFile(testPdfAsset, destination);
  return destination;
};

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const buildReq = (filePath) => ({
  file: { path: filePath, originalname: path.basename(filePath), mimetype: 'application/pdf' },
  user: { id: 'test-user' },
  config: { fileConfig: {}, endpoints: {} },
  body: { model: 'gpt-4o' },
});

const responseFactory = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn();
  return res;
};

const cleanupTempDirs = async () => {
  if (!tempDirs.size) {
    return;
  }
  await Promise.all(
    [...tempDirs].map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
  tempDirs.clear();
};

const getLeanResult = (doc) => ({
  lean: jest.fn().mockResolvedValue(doc),
});

const { processAgentFileUpload } = require('./process');

describe('processAgentFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFileByHash.mockReset();
    mockEnsureTable.mockReset();
    mockUpsertFile.mockReset();
    mockFindOne.mockReset();
    mockCreateFile.mockReset();
    mockHandleFileUpload.mockReset();
  });

  afterEach(async () => {
    await cleanupTempDirs();
  });

  it('reuses canonical metadata when an existing hash is found', async () => {
    const filePath = await copyTestAsset();
    const req = buildReq(filePath);
    const res = responseFactory();
    const metadata = {
      agent_id: 'agent-dedup',
      tool_resource: EToolResources.file_search,
      file_id: 'dedup-file',
      temp_file_id: 'temp-dedup',
    };
    const expectedHash = await hashFile(filePath);
    const existingDoc = {
      file_id: 'canonical-file',
      metadata: { fileHash: expectedHash },
      filename: 'existing.pdf',
    };
    mockFindFileByHash.mockResolvedValue({ file_id: existingDoc.file_id });
    mockFindOne.mockReturnValueOnce(getLeanResult(existingDoc));

    await processAgentFileUpload({ req, res, metadata });

    expect(mockFindFileByHash).toHaveBeenCalledWith(expectedHash);
    expect(mockAddAgentResourceFile).toHaveBeenCalledWith({
      req,
      file_id: existingDoc.file_id,
      agent_id: metadata.agent_id,
      tool_resource: metadata.tool_resource,
    });
    expect(mockUpsertFile).toHaveBeenCalledWith(existingDoc);
    expect(mockCreateFile).not.toHaveBeenCalled();
    expect(mockFindOne).toHaveBeenCalledWith({ file_id: existingDoc.file_id });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'File already uploaded; reusing the previous entry',
      ...existingDoc,
    });
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('persists new uploads and upserts metadata when the hash is unique', async () => {
    const filePath = await copyTestAsset();
    const req = buildReq(filePath);
    const res = responseFactory();
    const metadata = {
      agent_id: 'agent-new',
      tool_resource: 'custom_tool',
      file_id: 'new-file',
      temp_file_id: 'temp-context',
    };
    const expectedHash = await hashFile(filePath);
    mockFindFileByHash.mockResolvedValue(null);
    const storageResult = {
      bytes: 4096,
      filepath: '/remote/uploads/Starbucks.pdf',
      filename: 'starbucks.pdf',
      embedded: false,
      height: 100,
      width: 100,
    };
    mockHandleFileUpload.mockResolvedValue(storageResult);
    const createFileResult = {
      file_id: metadata.file_id,
      filename: storageResult.filename,
      filepath: storageResult.filepath,
      bytes: storageResult.bytes,
      type: 'application/pdf',
      metadata: { fileHash: expectedHash },
    };
    mockCreateFile.mockResolvedValue(createFileResult);

    await processAgentFileUpload({ req, res, metadata });

    expect(mockFindFileByHash).toHaveBeenCalledWith(expectedHash);
    expect(mockHandleFileUpload).toHaveBeenCalled();
    expect(mockCreateFile).toHaveBeenCalled();
    expect(mockAddAgentResourceFile).toHaveBeenCalledWith({
      req,
      file_id: metadata.file_id,
      agent_id: metadata.agent_id,
      tool_resource: metadata.tool_resource,
    });
    expect(mockUpsertFile).toHaveBeenCalledWith(createFileResult);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Agent file uploaded and processed successfully',
      ...createFileResult,
    });
    const createArgs = mockCreateFile.mock.calls[0][0];
    expect(createArgs.metadata.fileHash).toBe(expectedHash);
  });
});