import {makeAutoObservable} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import {v4 as uuidv4} from 'uuid';
import {
  AssistantFormData,
  PalType,
  RoleplayFormData,
} from '../components/PalsSheets/types';

export type Pal = {id: string} & (AssistantFormData | RoleplayFormData);
export type AssistantPal = Pal & {palType: PalType.ASSISTANT};
export type RoleplayPal = Pal & {palType: PalType.ROLEPLAY};

class PalStore {
  pals: Pal[] = [];

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'PalStore',
      properties: ['pals'],
      storage: AsyncStorage,
    });
  }

  addPal = (data: AssistantFormData | RoleplayFormData) => {
    const newPal = {
      id: uuidv4(),
      ...data,
    } as Pal;
    this.pals.push(newPal);
  };

  updatePal = (
    id: string,
    data: Partial<AssistantFormData | RoleplayFormData>,
  ) => {
    const palIndex = this.pals.findIndex(p => p.id === id);
    if (palIndex !== -1) {
      const currentPal = this.pals[palIndex];
      this.pals[palIndex] = {
        ...currentPal,
        ...data,
        palType: currentPal.palType,
      } as Pal;
    }
  };

  deletePal = (id: string) => {
    const palIndex = this.pals.findIndex(p => p.id === id);
    if (palIndex !== -1) {
      this.pals.splice(palIndex, 1);
    }
  };

  getPals = () => {
    return this.pals;
  };
}

export const palStore = new PalStore();
