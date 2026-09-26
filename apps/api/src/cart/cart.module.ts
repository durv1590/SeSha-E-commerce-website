import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [CatalogModule],
  controllers: [CartController, WishlistController],
  providers: [CartService, WishlistService],
  exports: [CartService],
})
export class CartModule {}
