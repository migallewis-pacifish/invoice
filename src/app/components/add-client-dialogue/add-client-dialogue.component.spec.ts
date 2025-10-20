import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddClientDialogueComponent } from './add-client-dialogue.component';

describe('AddClientDialogueComponent', () => {
  let component: AddClientDialogueComponent;
  let fixture: ComponentFixture<AddClientDialogueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddClientDialogueComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddClientDialogueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
