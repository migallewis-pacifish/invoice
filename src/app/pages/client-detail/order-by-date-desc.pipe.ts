import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'orderByDateDesc',
  standalone: true
})
export class OrderByDateDescPipe implements PipeTransform {
  transform(arr: any[]): any[] {
    if (!Array.isArray(arr)) return arr;
    return [...arr].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }
}
