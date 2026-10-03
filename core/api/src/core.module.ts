import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/**
 * Platform services every module builds on: auth, tokens, the module
 * registry, jobs, files, events and audit (PRD 5.4). Only health exists yet.
 */
@Module({
  controllers: [HealthController],
})
export class CoreModule {}
