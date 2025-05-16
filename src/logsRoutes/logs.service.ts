import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LogsService {
  private readonly logFilePath = path.join(
    process.cwd(),
    'logs',
    'upload_logs.txt',
  );

  readLogFile(): string {
    if (!fs.existsSync(this.logFilePath)) {
      return 'Log file does not exist.';
    }

    return fs.readFileSync(this.logFilePath, 'utf-8');
  }
}
