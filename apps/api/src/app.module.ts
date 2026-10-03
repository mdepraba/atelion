import { Module } from '@nestjs/common';
import { CoreModule } from '@core/api';
import { FiscusModule } from '@fiscus/api';
import { PdfModule } from '@pdf/api';

/**
 * One process for every module (PRD 1.1). The module registry (FR-07) will
 * decide what registers here from each manifest; until then the list is fixed.
 */
@Module({
  imports: [CoreModule, FiscusModule, PdfModule],
})
export class AppModule {}
