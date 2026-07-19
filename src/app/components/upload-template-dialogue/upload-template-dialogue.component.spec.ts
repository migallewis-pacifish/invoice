import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadTemplateDialogueComponent } from './upload-template-dialogue.component';
import { DialogRef } from '@angular/cdk/dialog';

describe('UploadTemplateDialogueComponent', () => {
  let component: UploadTemplateDialogueComponent;
  let fixture: ComponentFixture<UploadTemplateDialogueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadTemplateDialogueComponent]
      , providers: [{ provide: DialogRef, useValue: { close: jasmine.createSpy('close') } }]
    })
    .overrideComponent(UploadTemplateDialogueComponent, { set: { template: '' } })
    .compileComponents();

    fixture = TestBed.createComponent(UploadTemplateDialogueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
