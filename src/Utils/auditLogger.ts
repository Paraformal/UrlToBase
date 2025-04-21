// utils/zipAuditLogger.ts
import * as fs from 'fs';
import * as path from 'path';

interface AuditEntry {
  timestamp: string;
  userEmail: string;
  fileUrl: string;
  fileSizeKB: number;
  fileType: string;
  validationResults: {
    pluginCheck: string[];
    htmlCssCheck: string[];
    bgStyleCheck: string[];
    videoCheck: string[];
    dimensionCheck: string[];
    fixedFiles?: Record<string, string>; // filename -> summary of fix
  };
  uploadedFiles: {
    FileName: string;
    FileExt: string;
    Url: string;
  }[];
  finalStatus: 'Success' | 'FixedAndUploaded' | 'ValidationFailed';
  errors?: string[];
}

export function logZipAudit(audit: AuditEntry, savePath = './zip_audit_logs') {
  try {
    const folder = path.resolve(savePath);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const filename = `audit_${Date.now()}.json`;
    const fullPath = path.join(folder, filename);
    fs.writeFileSync(fullPath, JSON.stringify(audit, null, 2));
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
