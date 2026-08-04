import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageUploadComponent } from './image-upload.component';

describe('ImageUploadComponent', () => {
  let fixture: ComponentFixture<ImageUploadComponent>;
  let component: ImageUploadComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ImageUploadComponent] }).compileComponents();
    fixture = TestBed.createComponent(ImageUploadComponent);
    component = fixture.componentInstance;
  });

  it('rejects non-image and oversized files', () => {
    (component as any).setFile(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    expect(component.error()).toContain('image file');

    (component as any).setFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
    expect(component.error()).toContain('smaller than 2 MB');
  });

  it('requires a signer name when configured for signatures', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
    component.requireName = true;
    (component as any).setFile(new File(['image'], 'signature.png', { type: 'image/png' }));
    expect(component.canUpload).toBeFalse();
    component.assetName.set('Alex Morgan');
    expect(component.canUpload).toBeTrue();
  });

  it('emits the selected image and optional name', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
    const emitted = spyOn(component.upload, 'emit');
    const file = new File(['image'], 'logo.png', { type: 'image/png' });
    (component as any).setFile(file);
    component.submit();
    expect(emitted).toHaveBeenCalledOnceWith({ file });
  });
});
