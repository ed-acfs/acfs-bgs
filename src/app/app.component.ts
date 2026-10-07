import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { version } from '../../package.json';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  constructor() {
    // The browser tab names the release too, like the page title (index.html has no version to keep in sync).
    inject(Title).setTitle(`ACFS BGS Tool ${version}`);
  }
}
