import { Injectable } from '@angular/core';
import { EmailVariableDefinition } from '../../../models/email-template-designer.model';
import { groupedTemplateVariables, TEMPLATE_VARIABLES, variableToken } from '../../../models/template-variable-registry.model';

@Injectable({ providedIn: 'root' })
export class EmailTemplateVariableRegistryService {
  readonly variables: EmailVariableDefinition[] = TEMPLATE_VARIABLES
    .filter(variable => ['Company', 'Client', 'Invoice', 'Letter', 'Payment', 'Custom'].includes(variable.group))
    .map(variable => ({ group: variable.group as EmailVariableDefinition['group'], path: variable.path, label: variable.label, token: variableToken(variable.path) }));

  groupedVariables() {
    return groupedTemplateVariables(['Company', 'Client', 'Invoice', 'Letter', 'Payment', 'Custom'])
      .map(group => ({
        group: group.group,
        variables: group.variables.map(variable => ({ group: variable.group as EmailVariableDefinition['group'], path: variable.path, label: variable.label, token: variableToken(variable.path) }))
      }));
  }

  tokenFor(path: string): string { return variableToken(path); }
}
