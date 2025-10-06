import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadTemplateDialogueComponent } from './upload-template-dialogue.component';

describe('UploadTemplateDialogueComponent', () => {
  let component: UploadTemplateDialogueComponent;
  let fixture: ComponentFixture<UploadTemplateDialogueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadTemplateDialogueComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadTemplateDialogueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
