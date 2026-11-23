import { isNil } from '@vxti/typed';
import { useContext } from 'react';
import { MouseContext } from '../context/mouse-context';

export function useMouseContext() {
  const context = useContext(MouseContext);
  if (isNil(context)) {
    throw new Error('useMouseContext must be used within a MouseProvider');
  }
  return context;
}
