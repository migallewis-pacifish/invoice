import { Component, inject } from '@angular/core';
import { RegisterService } from '../../services/register.service';

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [],
  templateUrl: './nav-bar.component.html',
  styleUrl: './nav-bar.component.scss'
})
export class NavBarComponent {
  private authService = inject(RegisterService);
  logout() { this.authService.logout(); }
}
