import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * File Storage Module — хранение фото, изображений заданий и вложений.
 * Абстракция за интерфейсом: STORAGE_DRIVER=supabase сейчас → s3 после MVP,
 * код приложения менять не придётся.
 */
@Injectable()
export class StorageService {
  private readonly driver: string;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get('STORAGE_DRIVER', 'supabase');
  }

  async upload(_key: string, _data: Buffer, _contentType: string): Promise<UploadResult> {
    switch (this.driver) {
      case 'supabase':
        // TODO: @supabase/supabase-js storage.from(bucket).upload(key, data)
        return { url: `supabase://${_key}`, key: _key };
      case 's3':
        // TODO: @aws-sdk/client-s3 PutObjectCommand
        return { url: `s3://${_key}`, key: _key };
      default:
        return { url: `local://${_key}`, key: _key };
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    // TODO: подписанная ссылка под текущий драйвер.
    return `${this.driver}://${key}`;
  }
}
