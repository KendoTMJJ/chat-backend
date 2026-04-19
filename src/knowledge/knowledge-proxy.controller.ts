import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../admin-auth/jwt/jwt-auth.guard';
import { AdminGuard } from '../admin-auth/jwt/admin.guard';
import { KnowledgeProxyService } from './knowledge-proxy.service';

@Controller('admin/knowledge')
@UseGuards(JwtAuthGuard, AdminGuard)
export class KnowledgeProxyController {
  constructor(private readonly service: KnowledgeProxyService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (!file.originalname.endsWith('.xlsx')) {
      throw new BadRequestException('Solo se permiten archivos .xlsx');
    }
    return this.service.uploadFile(file);
  }
}
