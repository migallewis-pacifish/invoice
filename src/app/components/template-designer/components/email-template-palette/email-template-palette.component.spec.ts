import { CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmailTemplatePaletteComponent } from './email-template-palette.component';

describe('EmailTemplatePaletteComponent', () => {
  let fixture: ComponentFixture<EmailTemplatePaletteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailTemplatePaletteComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EmailTemplatePaletteComponent);
    fixture.componentInstance.sections = [{
      id: 'section-1',
      type: 'layout',
      columnWidths: [50, 50],
      columns: [
        { id: 'column-1', elements: [], styles: { backgroundColor: '#fff', verticalAlign: 'top', paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10, borderColor: '#ccc', borderWidth: 0, borderRadius: 0 } },
        { id: 'column-2', elements: [], styles: { backgroundColor: '#fff', verticalAlign: 'top', paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10, borderColor: '#ccc', borderWidth: 0, borderRadius: 0 } }
      ],
      styles: {
        backgroundColor: '#fff',
        contentWidth: 600,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        columnGap: 0
      }
    }];
    fixture.detectChanges();
  });

  it('connects palette drags to their canvas drop targets', () => {
    const dropLists = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .map(element => element.injector.get(CdkDropList));

    expect(dropLists[0].connectedTo).toEqual(['email-template-section-canvas']);
    expect(dropLists[1].connectedTo).toEqual(['column-1', 'column-2']);
  });
});
