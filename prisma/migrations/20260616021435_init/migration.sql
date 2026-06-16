-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'PARENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AnswerType" AS ENUM ('SHORT', 'ESSAY', 'CODE', 'PHOTO');

-- CreateEnum
CREATE TYPE "CheckingType" AS ENUM ('AUTO', 'AI', 'HYBRID');

-- CreateEnum
CREATE TYPE "AiRequestType" AS ENUM ('CHECK_ANSWER', 'CHECK_ESSAY', 'EXPLAIN_TASK', 'PHOTO_TASK', 'GENERATE_PLAN', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI');

-- CreateEnum
CREATE TYPE "AiRequestStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanDayStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('GREEN', 'YELLOW', 'RED', 'GRAY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH', 'TELEGRAM', 'IN_APP');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "grade" INTEGER,
    "target_score" INTEGER,
    "current_score" INTEGER,
    "daily_minutes" INTEGER,
    "exam_date" TIMESTAMP(3),
    "selected_subjects" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_links" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "exam_type" TEXT NOT NULL DEFAULT 'EGE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "parent_topic_id" UUID,
    "name" TEXT NOT NULL,
    "ege_block" TEXT,
    "ege_task_numbers" INTEGER[],
    "difficulty_level" INTEGER NOT NULL DEFAULT 1,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID,
    "ege_task_number" INTEGER,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "image_url" TEXT,
    "answer_type" "AnswerType" NOT NULL,
    "correct_answer" TEXT,
    "explanation" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "max_score" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_answers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "answer" TEXT,
    "is_correct" BOOLEAN,
    "score" INTEGER,
    "checking_type" "CheckingType" NOT NULL,
    "ai_feedback" JSONB,
    "mistakes" TEXT[],
    "time_spent_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "request_type" "AiRequestType" NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "input_payload" JSONB NOT NULL,
    "output_payload" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost" DECIMAL(10,6),
    "confidence_score" DOUBLE PRECISION,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "cache_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "target_score" INTEGER,
    "exam_date" TIMESTAMP(3),
    "daily_minutes" INTEGER,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_days" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "topics" TEXT[],
    "tasks" TEXT[],
    "estimated_minutes" INTEGER,
    "status" "PlanDayStatus" NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "study_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "accuracy_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "average_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TopicStatus" NOT NULL DEFAULT 'GRAY',
    "last_practiced_at" TIMESTAMP(3),

    CONSTRAINT "topic_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_exams" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "tasks" TEXT[],
    "max_primary_score" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mock_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_exam_results" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mock_exam_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "primary_score" INTEGER NOT NULL,
    "test_score" INTEGER,
    "weak_topics" TEXT[],
    "ai_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mock_exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_name" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "limits" JSONB NOT NULL,
    "provider" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "webhook_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" "AiRequestType" NOT NULL,
    "template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "student_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_links_parent_id_student_id_key" ON "parent_links"("parent_id", "student_id");

-- CreateIndex
CREATE INDEX "topics_subject_id_idx" ON "topics"("subject_id");

-- CreateIndex
CREATE INDEX "tasks_subject_id_idx" ON "tasks"("subject_id");

-- CreateIndex
CREATE INDEX "tasks_topic_id_idx" ON "tasks"("topic_id");

-- CreateIndex
CREATE INDEX "user_answers_user_id_idx" ON "user_answers"("user_id");

-- CreateIndex
CREATE INDEX "user_answers_task_id_idx" ON "user_answers"("task_id");

-- CreateIndex
CREATE INDEX "ai_requests_user_id_idx" ON "ai_requests"("user_id");

-- CreateIndex
CREATE INDEX "ai_requests_request_type_idx" ON "ai_requests"("request_type");

-- CreateIndex
CREATE INDEX "ai_requests_cache_key_idx" ON "ai_requests"("cache_key");

-- CreateIndex
CREATE INDEX "study_plans_user_id_idx" ON "study_plans"("user_id");

-- CreateIndex
CREATE INDEX "study_plan_days_plan_id_idx" ON "study_plan_days"("plan_id");

-- CreateIndex
CREATE INDEX "topic_progress_user_id_idx" ON "topic_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_progress_user_id_topic_id_key" ON "topic_progress"("user_id", "topic_id");

-- CreateIndex
CREATE INDEX "mock_exam_results_user_id_idx" ON "mock_exam_results"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "payments_subscription_id_idx" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "analytics_events_name_idx" ON "analytics_events"("name");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_key_version_key" ON "prompt_templates"("key", "version");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_topic_id_fkey" FOREIGN KEY ("parent_topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_days" ADD CONSTRAINT "study_plan_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_results" ADD CONSTRAINT "mock_exam_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_results" ADD CONSTRAINT "mock_exam_results_mock_exam_id_fkey" FOREIGN KEY ("mock_exam_id") REFERENCES "mock_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
