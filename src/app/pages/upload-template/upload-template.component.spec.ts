import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadTemplateComponent } from './upload-template.component';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { ActivityService } from '../../services/activity.service';
import { TemplateService } from '../../services/template.service';
import { CURRENT_AUTH_USER } from '../../services/company-context.service';
import { of } from 'rxjs';

describe('UploadTemplateComponent', () => {
  let component: UploadTemplateComponent;
  let fixture: ComponentFixture<UploadTemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadTemplateComponent]
      , providers: [
        { provide: CURRENT_AUTH_USER, useValue: of(null) },
        { provide: Firestore, useValue: {} },
        { provide: Storage, useValue: {} },
        { provide: ActivityService, useValue: {} },
        { provide: TemplateService, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
