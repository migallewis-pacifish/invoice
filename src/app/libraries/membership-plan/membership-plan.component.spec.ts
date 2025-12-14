import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MembershipPlanComponent } from './membership-plan.component';

describe('MembershipPlanComponent', () => {
  let component: MembershipPlanComponent;
  let fixture: ComponentFixture<MembershipPlanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MembershipPlanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MembershipPlanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
