import { View, Text, Input, Picker, Image } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState, useRef } from 'react'
import { useRecordStore } from '../../stores/recordStore'
import { recordApi } from '../../utils/request'
import { formatDate, formatHM, formatDurationLong } from '../../utils/date'
import { chooseAndUploadImage } from '../../utils/upload'
import './index.scss'

const recordTypes = {
	feeding: { title: '喂奶记录', icon: '🍼' },
	diaper: { title: '换尿布记录', icon: '💩' },
	sleep: { title: '睡眠记录', icon: '😴' },
	food: { title: '辅食记录', icon: '🍚' },
	water: { title: '饮水记录', icon: '💧' },
	temperature: { title: '体温记录', icon: '🌡️' },
	height_weight: { title: '身高体重', icon: '📏' },
	medicine: { title: '用药记录', icon: '💊' },
	vaccine: { title: '疫苗记录', icon: '💉' },
	bath: { title: '洗澡记录', icon: '🛁' },
	outdoor: { title: '户外活动', icon: '🌳' },
}

const feedingMethods = [
	{ value: 'breast', label: '母乳' },
	{ value: 'formula', label: '奶粉' },
	{ value: 'mixed', label: '混合' },
]

const diaperStatuses = [
	{ value: 'wet', label: '尿了' },
	{ value: 'dirty', label: '拉了' },
	{ value: 'both', label: '都有' },
]

export default function RecordPage() {
	const router = useRouter()
	const { type = 'feeding', babyId, id } = router.params
	const isEdit = !!id
	const { addRecord, updateRecord } = useRecordStore()

	const [loading, setLoading] = useState(false)
	const submittingRef = useRef(false) // 同步锁，避免 state 异步更新导致连点漏拦截
	const [feedingMethod, setFeedingMethod] = useState('formula')
	const [amount, setAmount] = useState('')
	const [breastAmount, setBreastAmount] = useState('')
	const [formulaAmount, setFormulaAmount] = useState('')
	const [duration, setDuration] = useState('')
	const [sleepEndTime, setSleepEndTime] = useState(formatHM(new Date()))
	const [diaperStatus, setDiaperStatus] = useState('wet')
	const [diaperImage, setDiaperImage] = useState('')
	const [foodName, setFoodName] = useState('')
	const [temperature, setTemperature] = useState('')
	const [height, setHeight] = useState('')
	const [weight, setWeight] = useState('')
	const [medicineName, setMedicineName] = useState('')
	const [medicineDose, setMedicineDose] = useState('')
	const [vaccineName, setVaccineName] = useState('')
	const [vaccineHospital, setVaccineHospital] = useState('')
	const [outdoorLocation, setOutdoorLocation] = useState('')
	const [note, setNote] = useState('')
	const [startTime, setStartTime] = useState(formatHM(new Date()))
	const [measurementDate, setMeasurementDate] = useState(formatDate(new Date()))
	const today = formatDate(new Date())

	const typeInfo = recordTypes[type] || recordTypes.feeding

	// 编辑态：进入页面时拉取原始记录，回填各字段
	useDidShow(() => {
		if (isEdit && id) {
			fetchRecord()
		}
	})

	const fetchRecord = async () => {
		try {
			const res = await recordApi.getOne(id)
			const record = res.data
			if (!record) return

			if (type === 'height_weight') {
				setMeasurementDate(formatDate(record.startTime))
			} else {
				setStartTime(formatHM(record.startTime))
			}

			switch (type) {
				case 'feeding':
					if (record.feedingMethod) setFeedingMethod(record.feedingMethod)
					if (record.amount != null) setAmount(String(record.amount))
					if (record.breastAmount != null)
						setBreastAmount(String(record.breastAmount))
					if (record.formulaAmount != null)
						setFormulaAmount(String(record.formulaAmount))
					if (record.duration != null) setDuration(String(record.duration))
					break
				case 'diaper':
					if (record.diaperStatus) setDiaperStatus(record.diaperStatus)
					if (record.diaperImage) setDiaperImage(record.diaperImage)
					break
				case 'sleep':
					if (record.endTime) setSleepEndTime(formatHM(record.endTime))
					break
				case 'food':
					if (record.foodName) setFoodName(record.foodName)
					break
				case 'water':
					if (record.amount != null) setAmount(String(record.amount))
					break
				case 'temperature':
					if (record.temperature != null)
						setTemperature(String(record.temperature))
					break
				case 'height_weight':
					if (record.height != null) setHeight(String(record.height))
					if (record.weight != null) setWeight(String(record.weight))
					break
				case 'medicine':
					if (record.medicineName) setMedicineName(record.medicineName)
					if (record.medicineDose) setMedicineDose(record.medicineDose)
					break
				case 'vaccine':
					if (record.vaccineName) setVaccineName(record.vaccineName)
					if (record.vaccineHospital) setVaccineHospital(record.vaccineHospital)
					break
				case 'outdoor':
					if (record.outdoorLocation) setOutdoorLocation(record.outdoorLocation)
					if (record.duration != null) setDuration(String(record.duration))
					break
			}

			if (record.note) setNote(record.note)
		} catch (error) {
			Taro.showToast({ title: '获取记录失败', icon: 'none' })
		}
	}

	const handleTimeChange = e => {
		setStartTime(e.detail.value)
	}

	const handleMeasurementDateChange = e => {
		setMeasurementDate(e.detail.value)
	}

	const handleSleepEndTimeChange = e => {
		setSleepEndTime(e.detail.value)
	}

	// 根据入睡/起床时间自动推算睡眠时长（分钟），跨天入睡则按次日起床计算
	const buildTimeOnDate = (baseDate: Date, time: string) => {
		const [hours, minutes] = time.split(':')
		const d = new Date(baseDate)
		d.setHours(parseInt(hours), parseInt(minutes), 0, 0)
		return d
	}

	const buildMeasurementDate = (date: string) => {
		const [year, month, day] = date.split('-').map(Number)
		return new Date(year, month - 1, day, 12, 0, 0, 0)
	}

	const getSleepRange = () => {
		const today = new Date()
		const start = buildTimeOnDate(today, startTime)
		let end = buildTimeOnDate(today, sleepEndTime)
		if (end <= start) {
			end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
		}
		const durationMinutes = Math.round(
			(end.getTime() - start.getTime()) / 60000,
		)
		return { start, end, durationMinutes }
	}

	const sleepDurationMinutes =
		type === 'sleep' ? getSleepRange().durationMinutes : 0

	const handleSubmit = async () => {
		if (submittingRef.current) return
		submittingRef.current = true
		setLoading(true)
		try {
			const now = new Date()
			const [hours, minutes] = startTime.split(':')
			now.setHours(parseInt(hours), parseInt(minutes), 0, 0)

			const data: any = {
				babyId,
				type,
				startTime: now.toISOString(),
			}
			if (type === 'height_weight') {
				data.startTime = buildMeasurementDate(measurementDate > today ? today : measurementDate).toISOString()
			}

			switch (type) {
				case 'feeding':
					data.feedingMethod = feedingMethod
					if (feedingMethod === 'mixed') {
						if (breastAmount) data.breastAmount = parseInt(breastAmount)
						if (formulaAmount) data.formulaAmount = parseInt(formulaAmount)
					} else if (amount) {
						data.amount = parseInt(amount)
					}
					if (duration) data.duration = parseInt(duration)
					break
				case 'diaper':
					data.diaperStatus = diaperStatus
					if (diaperImage) data.diaperImage = diaperImage
					break
				case 'sleep': {
					const { start, end, durationMinutes } = getSleepRange()
					data.startTime = start.toISOString()
					data.endTime = end.toISOString()
					data.duration = durationMinutes
					break
				}
				case 'food':
					data.foodName = foodName
					break
				case 'water':
					if (amount) data.amount = parseInt(amount)
					break
				case 'temperature':
					if (temperature) data.temperature = parseFloat(temperature)
					break
				case 'height_weight':
					if (height) data.height = parseFloat(height)
					if (weight) data.weight = parseFloat(weight)
					break
				case 'medicine':
					data.medicineName = medicineName
					data.medicineDose = medicineDose
					break
				case 'vaccine':
					data.vaccineName = vaccineName
					data.vaccineHospital = vaccineHospital
					break
				case 'outdoor':
					data.outdoorLocation = outdoorLocation
					if (duration) data.duration = parseInt(duration)
					break
			}

			if (note) data.note = note

			if (isEdit) {
				// 更新接口由记录 ID 确定所属宝宝和记录类型，不能重复提交创建专用字段。
				const { babyId: _babyId, type: _type, ...updateData } = data
				await updateRecord(id, updateData)
				Taro.showToast({ title: '更新成功', icon: 'success' })
			} else {
				await addRecord(data)
				Taro.showToast({ title: '记录成功', icon: 'success' })
			}
			setTimeout(() => Taro.navigateBack(), 1500)
		} catch (error) {
			submittingRef.current = false
			setLoading(false)
			Taro.showToast({ title: isEdit ? '更新失败' : '记录失败', icon: 'none' })
		}
	}

	return (
		<View className="record-page">
			<View className="record-header">
				<Text className="record-icon">{typeInfo.icon}</Text>
				<Text className="record-title">{typeInfo.title}</Text>
			</View>

			<View className="record-form">
				{/* 身高体重按测量日期记录，其余记录按具体时间记录 */}
				<View className="form-group">
					<Text className="form-label">
						{type === 'height_weight' ? '测量日期' : type === 'sleep' ? '入睡时间' : '时间'}
					</Text>
					{type === 'height_weight' ? (
						<Picker mode="date" value={measurementDate} end={today} onChange={handleMeasurementDateChange}>
							<View className="form-input time-input">
								<Text>{measurementDate}</Text>
							</View>
						</Picker>
					) : (
						<Picker mode="time" value={startTime} onChange={handleTimeChange}>
							<View className="form-input time-input">
								<Text>{startTime}</Text>
							</View>
						</Picker>
					)}
				</View>

				{/* 喂奶相关 */}
				{type === 'feeding' && (
					<>
						<View className="form-group">
							<Text className="form-label">喂养方式</Text>
							<View className="method-grid">
								{feedingMethods.map(m => (
									<View
										key={m.value}
										className={`method-item ${feedingMethod === m.value ? 'active' : ''}`}
										onClick={() => setFeedingMethod(m.value)}
									>
										<Text>{m.label}</Text>
									</View>
								))}
							</View>
						</View>
						{(feedingMethod === 'formula' || feedingMethod === 'breast') && (
							<View className="form-group">
								<Text className="form-label">
									{feedingMethod === 'breast'
										? '母乳量 (ml，可选)'
										: '奶量 (ml)'}
								</Text>
								<Input
									className="form-input"
									type="number"
									placeholder="请输入奶量"
									value={amount}
									onInput={e => setAmount(e.detail.value)}
								/>
							</View>
						)}
						{feedingMethod === 'mixed' && (
							<>
								<View className="form-group">
									<Text className="form-label">母乳量 (ml)</Text>
									<Input
										className="form-input"
										type="number"
										placeholder="请输入母乳量"
										value={breastAmount}
										onInput={e => setBreastAmount(e.detail.value)}
									/>
								</View>
								<View className="form-group">
									<Text className="form-label">奶粉量 (ml)</Text>
									<Input
										className="form-input"
										type="number"
										placeholder="请输入奶粉量"
										value={formulaAmount}
										onInput={e => setFormulaAmount(e.detail.value)}
									/>
								</View>
							</>
						)}
						<View className="form-group">
							<Text className="form-label">时长 (分钟)</Text>
							<Input
								className="form-input"
								type="number"
								placeholder="请输入时长"
								value={duration}
								onInput={e => setDuration(e.detail.value)}
							/>
						</View>
					</>
				)}

				{/* 尿布相关 */}
				{type === 'diaper' && (
					<>
						<View className="form-group">
							<Text className="form-label">状态</Text>
							<View className="method-grid">
								{diaperStatuses.map(s => (
									<View
										key={s.value}
										className={`method-item ${diaperStatus === s.value ? 'active' : ''}`}
										onClick={() => setDiaperStatus(s.value)}
									>
										<Text>{s.label}</Text>
									</View>
								))}
							</View>
						</View>
						<View className="form-group">
							<Text className="form-label">照片 (可选)</Text>
							{diaperImage ? (
								<View className="image-preview">
									<Image
										className="image-preview-img"
										src={diaperImage}
										mode="aspectFill"
										onClick={() =>
											Taro.previewImage({
												current: diaperImage,
												urls: [diaperImage],
											})
										}
									/>
									<View
										className="image-remove-badge"
										onClick={() => setDiaperImage('')}
									>
										<Text>×</Text>
									</View>
								</View>
							) : (
								<View
									className="image-picker"
									onClick={async () => {
										const url = await chooseAndUploadImage()
										if (url) setDiaperImage(url)
									}}
								>
									<Text className="image-picker-icon">📷</Text>
									<Text className="image-picker-text">上传照片</Text>
								</View>
							)}
						</View>
					</>
				)}

				{/* 睡眠相关：入睡/起床时间，自动推算时长 */}
				{type === 'sleep' && (
					<>
						<View className="form-group">
							<Text className="form-label">起床时间</Text>
							<Picker
								mode="time"
								value={sleepEndTime}
								onChange={handleSleepEndTimeChange}
							>
								<View className="form-input time-input">
									<Text>{sleepEndTime}</Text>
								</View>
							</Picker>
						</View>
						<View className="form-group">
							<Text className="form-label">睡眠时长</Text>
							<View className="form-input sleep-duration-display">
								<Text>{formatDurationLong(sleepDurationMinutes)}</Text>
							</View>
						</View>
					</>
				)}

				{/* 辅食相关 */}
				{type === 'food' && (
					<View className="form-group">
						<Text className="form-label">辅食名称</Text>
						<Input
							className="form-input"
							placeholder="如：米粉、果泥"
							value={foodName}
							onInput={e => setFoodName(e.detail.value)}
						/>
					</View>
				)}

				{/* 饮水相关 */}
				{type === 'water' && (
					<View className="form-group">
						<Text className="form-label">饮水量 (ml)</Text>
						<Input
							className="form-input"
							type="number"
							placeholder="请输入饮水量"
							value={amount}
							onInput={e => setAmount(e.detail.value)}
						/>
					</View>
				)}

				{/* 体温相关 */}
				{type === 'temperature' && (
					<View className="form-group">
						<Text className="form-label">体温 (°C)</Text>
						<Input
							className="form-input"
							type="digit"
							placeholder="请输入体温"
							value={temperature}
							onInput={e => setTemperature(e.detail.value)}
						/>
					</View>
				)}

				{/* 身高体重 */}
				{type === 'height_weight' && (
					<>
						<View className="form-group">
							<Text className="form-label">身高 (cm)</Text>
							<Input
								className="form-input"
								type="digit"
								placeholder="请输入身高"
								value={height}
								onInput={e => setHeight(e.detail.value)}
							/>
						</View>
						<View className="form-group">
							<Text className="form-label">体重 (kg)</Text>
							<Input
								className="form-input"
								type="digit"
								placeholder="请输入体重"
								value={weight}
								onInput={e => setWeight(e.detail.value)}
							/>
						</View>
					</>
				)}

				{/* 用药相关 */}
				{type === 'medicine' && (
					<>
						<View className="form-group">
							<Text className="form-label">药品名称</Text>
							<Input
								className="form-input"
								placeholder="请输入药品名称"
								value={medicineName}
								onInput={e => setMedicineName(e.detail.value)}
							/>
						</View>
						<View className="form-group">
							<Text className="form-label">用药剂量</Text>
							<Input
								className="form-input"
								placeholder="如：1次1包，1天3次"
								value={medicineDose}
								onInput={e => setMedicineDose(e.detail.value)}
							/>
						</View>
					</>
				)}

				{/* 疫苗相关 */}
				{type === 'vaccine' && (
					<>
						<View className="form-group">
							<Text className="form-label">疫苗名称</Text>
							<Input
								className="form-input"
								placeholder="请输入疫苗名称"
								value={vaccineName}
								onInput={e => setVaccineName(e.detail.value)}
							/>
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
					</>
				)}

				{/* 户外活动 */}
				{type === 'outdoor' && (
					<>
						<View className="form-group">
							<Text className="form-label">活动地点</Text>
							<Input
								className="form-input"
								placeholder="如：小区公园"
								value={outdoorLocation}
								onInput={e => setOutdoorLocation(e.detail.value)}
							/>
						</View>
						<View className="form-group">
							<Text className="form-label">活动时长 (分钟)</Text>
							<Input
								className="form-input"
								type="number"
								placeholder="请输入活动时长"
								value={duration}
								onInput={e => setDuration(e.detail.value)}
							/>
						</View>
					</>
				)}

				{/* 备注 */}
				<View className="form-group">
					<Text className="form-label">备注 (可选)</Text>
					<Input
						className="form-input"
						placeholder="添加备注..."
						value={note}
						onInput={e => setNote(e.detail.value)}
					/>
				</View>
			</View>

			<View
				className={`submit-btn${loading ? ' disabled' : ''}`}
				onClick={loading ? undefined : handleSubmit}
			>
				<Text className="submit-text">
					{loading
						? isEdit
							? '保存中...'
							: '提交中...'
						: isEdit
							? '保存修改'
							: '保存记录'}
				</Text>
			</View>
		</View>
	)
}
