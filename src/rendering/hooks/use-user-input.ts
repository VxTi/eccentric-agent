import { useContext } from 'react';
import {
  UserInputContext,
  type UserInputContextInstance,
} from '../context/user-input-context';

export function useUserInputField(): UserInputContextInstance {
  const context = useContext(UserInputContext);

  if (!context) {
    throw new Error(
      'useUserInputField must be used within a UserInputContextProvider'
    );
  }
  return context;
}
