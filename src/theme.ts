import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Verde de la marca (#2b8a3e en el índice 8).
const pasto: MantineColorsTuple = [
  '#ebfbee',
  '#d3f9d8',
  '#b2f2bb',
  '#8ce99a',
  '#69db7c',
  '#51cf66',
  '#40c057',
  '#37b24d',
  '#2b8a3e',
  '#1f6b2f',
];

// Áreas táctiles: botones e inputs en tamaño "lg" (50px de alto, texto de 18px que además
// evita el zoom automático de iOS al enfocar un campo).
export const theme = createTheme({
  colors: { pasto },
  primaryColor: 'pasto',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSizes: { md: '1.0625rem' },
  components: {
    Button: { defaultProps: { size: 'lg' } },
    TextInput: { defaultProps: { size: 'lg' } },
    PasswordInput: { defaultProps: { size: 'lg' } },
    NumberInput: { defaultProps: { size: 'lg' } },
    Textarea: { defaultProps: { size: 'lg' } },
    Select: { defaultProps: { size: 'lg' } },
    DatePickerInput: { defaultProps: { size: 'lg' } },
    // Toda la etiqueta es tocable y mide 44px de alto como mínimo.
    Checkbox: {
      defaultProps: { size: 'lg' },
      styles: { label: { minHeight: 44, display: 'flex', alignItems: 'center' }, body: { alignItems: 'flex-start' } },
    },
    Radio: { defaultProps: { size: 'lg' } },
    Switch: { defaultProps: { size: 'lg' } },
    SegmentedControl: { defaultProps: { size: 'lg' } },
    // Los avisos se cierran solos: sin la cruz de solo ícono.
    Notification: { defaultProps: { withCloseButton: false } },
  },
});
