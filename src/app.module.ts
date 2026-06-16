import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AnswersModule } from './modules/answers/answers.module';
import { AiModule } from './modules/ai/ai.module';
import { StudyPlanModule } from './modules/study-plan/study-plan.module';
import { ProgressModule } from './modules/progress/progress.module';
import { MockExamsModule } from './modules/mock-exams/mock-exams.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { ScoreForecastModule } from './modules/score-forecast/score-forecast.module';
import { ParentReportModule } from './modules/parent-report/parent-report.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,

    // Доменные модули (1:1 с разделом 7.3 ТЗ)
    AuthModule,
    UsersModule, // User Profile
    SubjectsModule, // Subject & Topic
    TasksModule, // Task Bank
    AnswersModule, // Answer Checking
    AiModule, // AI Orchestrator
    StudyPlanModule,
    ProgressModule,
    MockExamsModule,
    RecommendationsModule,
    ScoreForecastModule,
    ParentReportModule,
    SubscriptionsModule,
    NotificationsModule,
    AnalyticsModule,
    AdminModule,
    StorageModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
