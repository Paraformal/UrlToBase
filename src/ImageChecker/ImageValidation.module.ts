import { Module } from '@nestjs/common';
import { ImageValidationController } from './ImageValidation.controller';
import { ImageValidationService } from './ImageValidation.service';
import { LoggerService } from '../utils/logger.service';

@Module({
  controllers: [ImageValidationController],
  providers: [ImageValidationService, LoggerService],
})
export class ImageValidationModule {}
