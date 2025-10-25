import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkFolderDialogueComponent } from './link-folder-dialogue.component';

describe('LinkFolderDialogueComponent', () => {
  let component: LinkFolderDialogueComponent;
  let fixture: ComponentFixture<LinkFolderDialogueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkFolderDialogueComponent]
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
