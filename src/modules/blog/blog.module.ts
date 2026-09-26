import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { BlogAccessController } from './blog-access.controller';
import { BlogAccessService } from './blog-access.service';
import { BlogWebhook } from './blog-webhook.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { PublicReadKeyGuard } from './guards/public-read-key.guard';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { OBJECT_STORAGE } from './object-storage';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PublicBlogController } from './public-blog.controller';
import { R2ObjectStorage } from './r2-object-storage';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  imports: [ApiKeysModule],
  controllers: [
    BlogAccessController,
    MediaController,
    PostsController,
    CategoriesController,
    TagsController,
    PublicBlogController,
  ],
  providers: [
    PostsService,
    CategoriesService,
    TagsService,
    MediaService,
    BlogAccessService,
    BlogWebhook,
    PublicReadKeyGuard,
    { provide: OBJECT_STORAGE, useClass: R2ObjectStorage },
  ],
})
export class BlogModule {}
