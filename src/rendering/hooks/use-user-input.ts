import { isNonEmptyArray, type Nullable } from '@vxti/typed';
import { useContext } from 'react';
import { CHANNEL_ID_NONE } from '../../lib/events/user-input';
import {
  UserInputContext,
  type InputAreaContextInstance,
  type InputRequestState,
} from '../context/user-input-context';

/**
 * Accesses the user input field state provided by a `UserInputContextProvider` ancestor.
 *
 * @returns The current `UserInputContextInstance` for reading and updating the input field.
 */
export function useInputArea(): InputAreaContextInstance {
  const context = useContext(UserInputContext);

  if (!context) {
    throw new Error(
      'useUserInputField must be used within a UserInputContextProvider'
    );
  }
  return context;
}

export function hasActiveInputRequest(
  inputRequest: Nullable<InputRequestState>
): inputRequest is InputRequestState {
  return (
    isNonEmptyArray(inputRequest?.request.options) &&
    inputRequest.request.channelId !== CHANNEL_ID_NONE
  );
}
