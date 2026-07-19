import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddClientDialogueComponent } from './add-client-dialogue.component';
import { DialogRef } from '@angular/cdk/dialog';

describe('AddClientDialogueComponent', () => {
  let component: AddClientDialogueComponent;
  let fixture: ComponentFixture<AddClientDialogueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddClientDialogueComponent]
      , providers: [{ provide: DialogRef, useValue: { close: jasmine.createSpy('close') } }]
    })
    .overrideComponent(AddClientDialogueComponent, { set: { template: '' } })
    .compileComponents();

    fixture = TestBed.createComponent(AddClientDialogueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
