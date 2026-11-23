import { useContext } from 'react';
import {
  UserInputContext,
  type UserInputContextInstance,
} from '../context/user-input-context';

/**
 * Accesses the user input field state provided by a `UserInputContextProvider` ancestor.
 *
 * @throws If the hook is rendered outside of a `UserInputContextProvider`.
 * @returns The current `UserInputContextInstance` for reading and updating the input field.
 */
export function useUserInputField(): UserInputContextInstance {
  const context = useContext(UserInputContext);

  if (!context) {
    throw new Error(
      'useUserInputField must be used within a UserInputContextProvider'
    );
  }
  return context;
}
