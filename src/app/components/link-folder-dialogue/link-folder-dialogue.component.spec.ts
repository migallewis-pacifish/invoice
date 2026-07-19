import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkFolderDialogueComponent } from './link-folder-dialogue.component';
import { DialogRef } from '@angular/cdk/dialog';

describe('LinkFolderDialogueComponent', () => {
  let component: LinkFolderDialogueComponent;
  let fixture: ComponentFixture<LinkFolderDialogueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkFolderDialogueComponent]
      , providers: [{ provide: DialogRef, useValue: { close: jasmine.createSpy('close') } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LinkFolderDialogueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
