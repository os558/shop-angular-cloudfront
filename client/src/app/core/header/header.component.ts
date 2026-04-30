import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CartService } from '../../cart/cart.service';
import { AsyncPipe } from '@angular/common';
import { MatBadge } from '@angular/material/badge';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { environment } from 'src/environments/environment';
import { CONFIG_TOKEN } from '../injection-tokens/config.token';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [
    MatToolbar,
    RouterLink,
    MatTooltip,
    MatIconButton,
    MatMenuTrigger,
    MatIcon,
    MatBadge,
    MatMenu,
    MatMenuItem,
    AsyncPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  totalInCart = inject(CartService).totalInCart;

  protected readonly config = inject(CONFIG_TOKEN);

  useCognito = this.config.cognito.enabled;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('authorization_token');
  }

  login(): void {
    if (this.config.cognito.loginUrl) {
      window.location.href = this.config.cognito.loginUrl;
    }
  }

  logout(): void {
    localStorage.removeItem('authorization_token');
    window.location.reload();
  }
}
