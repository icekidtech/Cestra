import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

export interface PaginationParams {
  page: number;
  limit: number;
}

@Injectable()
export class ParsePaginationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata): PaginationParams {
    const page = parseInt(value?.page ?? '1', 10);
    const limit = Math.min(parseInt(value?.limit ?? '20', 10), 100);

    if (isNaN(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }
    if (isNaN(limit) || limit < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return { page, limit };
  }
}
