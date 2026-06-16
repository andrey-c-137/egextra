import { IsOptional, IsString, MinLength } from 'class-validator';

export class CheckEssayDto {
  @IsString()
  @MinLength(50, { message: 'Сочинение слишком короткое для проверки' })
  essay!: string;

  @IsOptional()
  @IsString()
  topic?: string;
}

export class ExplainTaskDto {
  @IsString()
  taskId!: string;

  @IsOptional()
  @IsString()
  studentAnswer?: string;
}

export class CheckAnswerDto {
  @IsString()
  taskId!: string;

  @IsString()
  answer!: string;
}

export class PhotoTaskDto {
  @IsString()
  imageBase64!: string;

  @IsOptional()
  @IsString()
  question?: string;
}

export class GeneratePlanDto {
  @IsString()
  subjectId!: string;
}
