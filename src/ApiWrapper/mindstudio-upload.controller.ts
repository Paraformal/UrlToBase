// src/mindstudio-upload/mindstudio-upload.controller.ts

import { Body, Controller, Post } from '@nestjs/common';
import { MindstudioUploadService } from './mindstudio-upload.service';
import { MindstudioUploadDto } from './MindStudio-api-Dtos/mindstudio-api-dto';

@Controller('api/ntg-ms/internal/wrapper')
export class MindstudioUploadController {
  constructor(
    private readonly mindstudioUploadService: MindstudioUploadService,
  ) {}

  @Post('upload')
  async upload(@Body() dto: MindstudioUploadDto) {
    return await this.mindstudioUploadService.sendToMindstudio(dto);
  }
}
