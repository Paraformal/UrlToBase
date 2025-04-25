// src/mindstudio-upload/mindstudio-upload.module.ts

import { Module } from '@nestjs/common';
import { MindstudioUploadController } from './mindstudio-upload.controller';
import { MindstudioUploadService } from './mindstudio-upload.service';

@Module({
  controllers: [MindstudioUploadController],
  providers: [MindstudioUploadService],
})
export class MindstudioUploadModule {}
