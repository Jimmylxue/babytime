import type { ExpenseCategoryCode } from '@baby-time/shared'
import diaperIcon from '../../assets/expense-icons/diaper.svg'
import formulaIcon from '../../assets/expense-icons/formula.svg'
import foodIcon from '../../assets/expense-icons/food.svg'
import feedingIcon from '../../assets/expense-icons/feeding.svg'
import clothingIcon from '../../assets/expense-icons/clothing.svg'
import toyIcon from '../../assets/expense-icons/toy.svg'
import medicalIcon from '../../assets/expense-icons/medical.svg'
import dailyIcon from '../../assets/expense-icons/daily.svg'
import travelIcon from '../../assets/expense-icons/travel.svg'
import otherIcon from '../../assets/expense-icons/other.svg'

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategoryCode, string> = {
	diaper: diaperIcon,
	formula: formulaIcon,
	food: foodIcon,
	feeding: feedingIcon,
	clothing: clothingIcon,
	toy: toyIcon,
	medical: medicalIcon,
	daily: dailyIcon,
	travel: travelIcon,
	other: otherIcon,
}