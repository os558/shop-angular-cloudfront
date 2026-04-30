import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './core/header/header.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeaderComponent, RouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(private router: Router) { }

  ngOnInit(): void {
    const hash = window.location.hash;

    if (hash && hash.includes('id_token=')) {
      // Parse the hash part properly
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      if (idToken) {
        localStorage.setItem('authorization_token', idToken);
        // Clean up the URL
        this.router.navigate([], { replaceUrl: true, fragment: undefined });
      }
    }
  }
}
