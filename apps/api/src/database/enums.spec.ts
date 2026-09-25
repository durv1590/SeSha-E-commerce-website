import { $Enums } from '@prisma/client';
import * as shared from '@seshakart/types';

/**
 * The API contract (packages/types) and the database (schema.prisma) must agree
 * on every enum. This fails the build as soon as one side changes without the other.
 */
const pairs: [string, readonly string[], Record<string, string>][] = [
  ['Role', shared.ROLES, $Enums.Role],
  ['UserStatus', shared.USER_STATUSES, $Enums.UserStatus],
  ['OrderStatus', shared.ORDER_STATUSES, $Enums.OrderStatus],
  ['PaymentStatus', shared.PAYMENT_STATUSES, $Enums.PaymentStatus],
  ['PaymentMethod', shared.PAYMENT_METHODS, $Enums.PaymentMethod],
  ['RefundStatus', shared.REFUND_STATUSES, $Enums.RefundStatus],
  ['DeliveryMethod', shared.DELIVERY_METHODS, $Enums.DeliveryMethod],
  ['ShipmentStatus', shared.SHIPMENT_STATUSES, $Enums.ShipmentStatus],
  ['ProductStatus', shared.PRODUCT_STATUSES, $Enums.ProductStatus],
  ['InventoryTxType', shared.INVENTORY_TX_TYPES, $Enums.InventoryTxType],
  ['CouponType', shared.COUPON_TYPES, $Enums.CouponType],
  ['ReviewStatus', shared.REVIEW_STATUSES, $Enums.ReviewStatus],
  ['QuestionStatus', shared.QUESTION_STATUSES, $Enums.QuestionStatus],
  ['ReturnType', shared.RETURN_TYPES, $Enums.ReturnType],
  ['ReturnStatus', shared.RETURN_STATUSES, $Enums.ReturnStatus],
  ['AddressLabel', shared.ADDRESS_LABELS, $Enums.AddressLabel],
  ['OtpChannel', shared.OTP_CHANNELS, $Enums.OtpChannel],
  ['OtpPurpose', shared.OTP_PURPOSES, $Enums.OtpPurpose],
  ['BannerPlacement', shared.BANNER_PLACEMENTS, $Enums.BannerPlacement],
  ['BannerTheme', shared.BANNER_THEMES, $Enums.BannerTheme],
  ['HomeSectionSource', shared.HOME_SECTION_SOURCES, $Enums.HomeSectionSource],
  ['ContactStatus', shared.CONTACT_STATUSES, $Enums.ContactStatus],
];

describe('shared enums match the database schema', () => {
  it.each(pairs)('%s', (_name, sharedValues, prismaEnum) => {
    expect([...sharedValues].sort()).toEqual(Object.values(prismaEnum).sort());
  });

  it('covers every Prisma enum', () => {
    expect(pairs.map(([n]) => n).sort()).toEqual(Object.keys($Enums).sort());
  });
});
