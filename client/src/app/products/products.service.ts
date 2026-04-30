import { Injectable } from '@angular/core';
import { EMPTY, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Product } from './product.interface';
import { ApiService } from '../core/api.service';

@Injectable({
  providedIn: 'root',
})
export class ProductsService extends ApiService {
  createNewProduct(product: Product): Observable<Product> {
    if (!this.endpointEnabled('bff')) {
      console.warn(
        'Endpoint "bff" is disabled. To enable change your environment.ts config'
      );
      return EMPTY;
    }

    const url = this.getUrl('bff', 'products');
    return this.http.post<Product>(url, product, {
      headers: {
        Authorization: this.getAuthorizationHeader(),
      },
    });
  }

  editProduct(id: string, changedProduct: Product): Observable<Product> {
    if (!this.endpointEnabled('bff')) {
      console.warn(
        'Endpoint "bff" is disabled. To enable change your environment.ts config'
      );
      return EMPTY;
    }

    const url = this.getUrl('bff', `products/${id}`);
    return this.http.put<Product>(url, changedProduct, {
      headers: {
        Authorization: this.getAuthorizationHeader(),
      },
    });
  }

  deleteProduct(id: string): Observable<void> {
    if (!this.endpointEnabled('bff')) {
      console.warn(
        'Endpoint "bff" is disabled. To enable change your environment.ts config'
      );
      return EMPTY;
    }

    const url = this.getUrl('bff', `products/${id}`);
    return this.http.delete<void>(url, {
      headers: {
        Authorization: this.getAuthorizationHeader(),
      },
    });
  }

  getProductById(id: string): Observable<Product | null> {
    if (!this.endpointEnabled('bff')) {
      console.warn(
        'Endpoint "bff" is disabled. To enable change your environment.ts config'
      );
      return this.http
        .get<Product[]>('/assets/products.json')
        .pipe(
          map(
            (products) => products.find((product) => product.id === id) || null
          )
        );
    }

    const url = this.getUrl('bff', `products/${id}`);
    return this.http.get<Product>(url, {
      headers: {
        Authorization: this.getAuthorizationHeader(),
      },
    });
  }

  getProducts(): Observable<Product[]> {
    if (!this.endpointEnabled('bff')) {
      console.warn(
        'Endpoint "bff" is disabled. To enable change your environment.ts config'
      );
      return this.http.get<Product[]>('/assets/products.json');
    }

    const url = this.getUrl('bff', 'products');
    return this.http.get<Product[]>(url);
  }

  getProductsForCheckout(ids: string[]): Observable<Product[]> {
    if (!ids.length) {
      return of([]);
    }

    return this.getProducts().pipe(
      map((products) => products.filter((product) => ids.includes(product.id)))
    );
  }
}
