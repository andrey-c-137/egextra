import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExamType, MathLevel } from '@prisma/client';

// Шаг 1: трек ОГЭ/ЕГЭ + класс
export class SetTrackDto {
  @IsEnum(ExamType)
  examType!: ExamType;

  @IsInt()
  @Min(8)
  @Max(11)
  grade!: number;
}

// Один выбранный экзамен
export class SelectedSubjectDto {
  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  targetScore?: number;

  @IsOptional()
  @IsEnum(MathLevel)
  mathLevel?: MathLevel;
}

// Шаг 2: список экзаменов с целями
export class SetSubjectsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SelectedSubjectDto)
  subjects!: SelectedSubjectDto[];
}
