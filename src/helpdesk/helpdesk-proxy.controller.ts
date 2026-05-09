import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../admin-auth/jwt/jwt-auth.guard';
import { AdminGuard } from '../admin-auth/jwt/admin.guard';
import { HelpdeskProxyService } from './helpdesk-proxy.service';
import { CreateHelpdeskCategoryDto } from './dto/create-helpdesk-response.dto';
import { UpdateHelpdeskCategoryDto } from './dto/update-helpdesk-response.dto';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('admin/helpdesk')
@UseGuards(JwtAuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class HelpdeskProxyController {
  constructor(private readonly service: HelpdeskProxyService) {}

  @Get('categories')
  list(@Query('intent') intent?: string) {
    return this.service.list(intent);
  }

  @Get('categories/intents')
  listIntents() {
    return this.service.listPublic();
  }

  @Get('categories/:id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @Post('categories')
  create(@Body() body: CreateHelpdeskCategoryDto) {
    return this.service.create(body);
  }

  @Patch('categories/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateHelpdeskCategoryDto,
  ) {
    return this.service.update(id, body);
  }

  @Delete('categories/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('categories/:id/document')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: MulterFile,
  ) {
    return this.service.uploadDocument(
      id,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Delete('categories/:id/document')
  deleteDocument(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteDocument(id);
  }
}
