import { Routes } from '@angular/router';
import { BgsTableComponent } from './bgs-table/bgs-table.component';
import { OrdersPageComponent } from './orders/orders-page.component';

export const routes: Routes = [
  {
    path: 'ordini',
    component: OrdersPageComponent,
  },
  {
    path: '**',
    component: BgsTableComponent,
  },
];
