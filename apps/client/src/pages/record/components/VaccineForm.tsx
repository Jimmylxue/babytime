import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { calculateAge } from '../../../utils/date'
import { useBabyStore } from '../../../stores/babyStore'
import {
	COMMON_VACCINE_SCHEDULE_IDS,
	findVaccineScheduleItem,
	getCurrentVaccineStage,
	VACCINE_SCHEDULE,
	VACCINE_SCHEDULE_VERSION,
	VaccineScheduleItem,
} from '../../../utils/vaccineSchedule'
import type { RecordFormHandle, RecordFormProps } from './types'

const VaccineForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function VaccineForm({ initialRecord, scheduleItemId }, ref) {
		const [vaccineName, setVaccineName] = useState(
			() => findVaccineScheduleItem(scheduleItemId)?.displayName || '',
		)
		const [vaccineHospital, setVaccineHospital] = useState('')
		const [selectedVaccineId, setSelectedVaccineId] = useState(
			scheduleItemId || '',
		)
		const [vaccineSearch, setVaccineSearch] = useState('')
		const [isCustomVaccine, setIsCustomVaccine] = useState(false)

		const selectedVaccine = findVaccineScheduleItem(selectedVaccineId)
		const currentBaby = useBabyStore(state => state.currentBaby)
		const currentVaccineItems = currentBaby
			? getCurrentVaccineStage(calculateAge(currentBaby.birthday).months)
			: []
		const suggestedVaccineItems =
			currentVaccineItems.length > 0
				? currentVaccineItems
				: COMMON_VACCINE_SCHEDULE_IDS.map(findVaccineScheduleItem).filter(
						(item): item is VaccineScheduleItem => !!item,
					)
		const normalizedVaccineSearch = vaccineSearch.trim().toLowerCase()
		const searchableVaccineItems = VACCINE_SCHEDULE.filter(
			item =>
				!normalizedVaccineSearch ||
				item.displayName.toLowerCase().includes(normalizedVaccineSearch) ||
				item.vaccineName.toLowerCase().includes(normalizedVaccineSearch),
		)

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.vaccineName) setVaccineName(initialRecord.vaccineName)
			if (initialRecord.vaccineHospital)
				setVaccineHospital(initialRecord.vaccineHospital)
			setSelectedVaccineId(initialRecord.vaccineScheduleItemId || '')
			setIsCustomVaccine(!initialRecord.vaccineScheduleItemId)
		}, [initialRecord])

		const selectVaccine = (item: VaccineScheduleItem) => {
			setSelectedVaccineId(item.id)
			setVaccineName(item.displayName)
			setIsCustomVaccine(false)
			setVaccineSearch('')
		}

		const selectCustomVaccine = () => {
			setSelectedVaccineId('')
			setVaccineName('')
			setIsCustomVaccine(true)
		}

		useImperativeHandle(ref, () => ({
			validate: () => (vaccineName.trim() ? null : '请选择或填写疫苗名称'),
			buildPayload: () => {
				const data: Record<string, any> = {
					vaccineName,
					vaccineHospital,
					isCustomVaccine,
				}
				const selected = findVaccineScheduleItem(selectedVaccineId)
				if (selected) {
					data.vaccineCode = selected.vaccineCode
					data.vaccineDose = selected.dose
					data.vaccineScheduleItemId = selected.id
					data.vaccineScheduleVersion = VACCINE_SCHEDULE_VERSION
				} else {
					// 编辑时切换为自定义疫苗，必须清除旧的时间轴关联。
					data.vaccineCode = ''
					data.vaccineDose = null
					data.vaccineScheduleItemId = ''
					data.vaccineScheduleVersion = ''
				}
				return data
			},
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">选择疫苗</Text>
					{currentVaccineItems.length > 0 && (
						<View className="vaccine-stage-tip">
							<Text>当前月龄可关注</Text>
						</View>
					)}
					<View className="vaccine-chip-grid">
						{suggestedVaccineItems.map(item => (
							<View
								key={item.id}
								className={`vaccine-chip${selectedVaccineId === item.id ? ' active' : ''}`}
								onClick={() => selectVaccine(item)}
							>
								<Text>{item.displayName}</Text>
							</View>
						))}
					</View>
					{selectedVaccine && (
						<View className="selected-vaccine-summary">
							<Text className="selected-vaccine-label">已选择</Text>
							<Text className="selected-vaccine-name">
								{selectedVaccine.displayName}
							</Text>
						</View>
					)}
					<View className="vaccine-search-wrap">
						<Input
							className="form-input vaccine-search-input"
							placeholder="搜索乙肝、百白破、脊灰等"
							value={vaccineSearch}
							onInput={e => setVaccineSearch(e.detail.value)}
						/>
						{normalizedVaccineSearch && (
							<View className="vaccine-search-results">
								{searchableVaccineItems.map(item => (
									<View
										key={item.id}
										className="vaccine-search-item"
										onTap={() => selectVaccine(item)}
									>
										<Text>{item.displayName}</Text>
										<Text>{item.ageLabel}</Text>
									</View>
								))}
								{searchableVaccineItems.length === 0 && (
									<Text className="vaccine-no-result">
										未找到，下面可自定义填写
									</Text>
								)}
							</View>
						)}
					</View>
					<View
						className={`vaccine-custom-trigger${isCustomVaccine ? ' active' : ''}`}
						onClick={selectCustomVaccine}
					>
						<Text>＋ 自定义疫苗</Text>
					</View>
					{isCustomVaccine && (
						<Input
							className="form-input vaccine-custom-input"
							placeholder="如：流感疫苗、肺炎球菌疫苗"
							value={vaccineName}
							onInput={e => setVaccineName(e.detail.value)}
						/>
					)}
				</View>
				<View className="form-group">
					<Text className="form-label">接种医院</Text>
					<Input
						className="form-input"
						placeholder="请输入接种医院"
						value={vaccineHospital}
						onInput={e => setVaccineHospital(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default VaccineForm
