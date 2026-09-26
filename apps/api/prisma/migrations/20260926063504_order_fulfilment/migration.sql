-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "invoice_date" TIMESTAMP(3),
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "shipped_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "orders_invoice_number_key" ON "orders"("invoice_number");


-- Invoice numbers: SK/<financial year>/<sequence>, formatted by InvoiceService.
CREATE SEQUENCE "invoice_number_seq" START 1 INCREMENT 1;
