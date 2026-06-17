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
  @IsEnum(ExamType, { message: 'Тип экзамена должен быть ОГЭ или ЕГЭ' })
  examType!: ExamType;

  @IsInt({ message: 'Класс должен быть числом' })
  @Min(8, { message: 'Класс не меньше 8' })
  @Max(11, { message: 'Класс не больше 11' })
  grade!: number;
}

// Один выбранный экзамен
export class SelectedSubjectDto {
  @IsUUID(undefined, { message: 'Некорректный идентификатор предмета' })
  subjectId!: string;

  @IsOptional()
  @IsInt({ message: 'Цель по баллам должна быть числом' })
  @Min(0, { message: 'Цель не меньше 0' })
  @Max(100, { message: 'Цель не больше 100' })
  targetScore?: number;

  @IsOptional()
  @IsEnum(MathLevel, { message: 'Некорректный уровень математики' })
  mathLevel?: MathLevel;
}

// Шаг 2: список экзаменов с целями
export class SetSubjectsDto {
  @IsArray({ message: 'Список предметов некорректен' })
  @ArrayMinSize(1, { message: 'Выберите хотя бы один предмет' })
  @ValidateNested({ each: true })
  @Type(() => SelectedSubjectDto)
  subjects!: SelectedSubjectDto[];
}
