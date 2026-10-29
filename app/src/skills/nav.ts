import { useGameStore, type Screen } from '../game/store'

/** Where the skill tree's back button goes (Profile, or the tab the top bar was on). */
let backTo: Screen = 'profile'
export const skillTreeBack = () => backTo

export function openSkillTree(from: Screen): void {
  backTo = from
  useGameStore.getState().goTo('skills')
}
