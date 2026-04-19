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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../admin-auth/jwt/jwt-auth.guard';
import { AdminGuard } from '../admin-auth/jwt/admin.guard';
import { HelpdeskProxyService } from './helpdesk-proxy.service';
import { CreateHelpdeskCategoryDto } from './dto/create-helpdesk-response.dto';
import { UpdateHelpdeskCategoryDto } from './dto/update-helpdesk-response.dto';

@Controller('admin/helpdesk')
@UseGuards(JwtAuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class HelpdeskProxyController {
  constructor(private readonly service: HelpdeskProxyService) {}

  @Get('categories')
  list(@Query('intent') intent?: string) {
    return this.service.list(intent);
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
}
