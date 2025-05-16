import { Controller, Get, Header } from '@nestjs/common';
import { LogsService } from './logs.service';

@Controller('api/ntg-ms/internal/wrapper/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  getLogFile(): string {
    return this.logsService.readLogFile();
  }
}
