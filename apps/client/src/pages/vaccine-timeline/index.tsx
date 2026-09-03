import { View, Text, Button, Picker, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { recordApi, notificationApi, trackEvent, VaccinePlanItem } from '../../utils/request'
import { calculateAge, formatDate } from '../../utils/date'
import { getCurrentVaccineStage, getVaccineReferenceDate, VACCINE_SCHEDULE, VaccineScheduleItem } from '../../utils/vaccineSchedule'
import vaccineRattle from '../../assets/vaccine-rattle.svg'
import bellIcon from '../../assets/icons/bell.svg'
import calendarIcon from '../../assets/icons/calendar-heart.svg'
import './index.scss'

interface VaccineRecord {
  id: string
  startTime: string
  vaccineName?: string
  vaccineHospital?: string
  vaccineScheduleItemId?: string
  isCustomVaccine?: boolean
}

const ageGroups = Array.from(new Set(VACCINE_SCHEDULE.map((item) => item.ageMonths)))

function formatVaccineDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

export default function VaccineTimelinePage() {
  const { isLoggedIn } = useAuthStore()
  const { currentBaby } = useBabyStore()
  const [records, setRecords] = useState<VaccineRecord[]>([])
  const [vaccinePlans, setVaccinePlans] = useState<Record<string, VaccinePlanItem>>({})
  const [loading, setLoading] = useState(false)
  const [vaccineState, setVaccineState] = useState<'never' | 'active' | 'exhausted'>('never')
  const [vaccineTemplateId, setVaccineTemplateId] = useState('')
  const requestingSubscriptionRef = useRef(false)
  const notificationTrackedRef = useRef(false)

  const loadData = async () => {
    if (!isLoggedIn) return
    try {
      setLoading(true)
      await useBabyStore.getState().fetchBabies()
      const babyState = useBabyStore.getState()
      const requestedBabyId = Taro.getCurrentInstance().router?.params?.babyId
      const requestedBaby = requestedBabyId
        ? babyState.babies.find((item) => item.id === requestedBabyId)
        : null
      if (requestedBaby && requestedBaby.id !== babyState.currentBaby?.id) {
        babyState.setCurrentBaby(requestedBaby)
      }
      const baby = requestedBaby || babyState.currentBaby
      if (!baby) return
      const [recordRes, planRes] = await Promise.all([
        recordApi.getVaccines(baby.id),
        notificationApi.getVaccinePlans(baby.id).catch(() => null),
      ])
      setRecords(recordRes.data || [])
      setVaccinePlans(Object.fromEntries((planRes?.data || []).map((plan) => [plan.scheduleItemId, plan])))
    } catch (error) {
      Taro.showToast({ title: '加载疫苗记录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadData()
    notificationApi.getConfig().then((res) => {
      setVaccineTemplateId(res.data?.vaccineEnabled ? res.data.vaccineTemplateId : '')
    }).catch(() => setVaccineTemplateId(''))
    if (isLoggedIn) {
      notificationApi.getStatus().then((res) => {
        setVaccineState(res.data?.state || 'never')
      }).catch(() => setVaccineState('never'))
    } else {
      setVaccineState('never')
    }
    const source = Taro.getCurrentInstance().router?.params?.source
    if (isLoggedIn && !notificationTrackedRef.current && source === 'notification_vaccine') {
      notificationTrackedRef.current = true
      void trackEvent('notification_open', { source })
    }
  })

  const requestVaccineSubscription = async () => {
    if (requestingSubscriptionRef.current) return
    if (vaccineState === 'active') {
      Taro.showToast({ title: '当前还有可用提醒次数', icon: 'none' })
      return
    }
    if (!vaccineTemplateId) {
      Taro.showToast({ title: '提醒服务暂未配置', icon: 'none' })
      return
    }
    requestingSubscriptionRef.current = true
    try {
      // 必须在用户点击回调中直接调用，不能先 await 网络请求，否则微信不会弹授权框。
      const requestSubscribeMessage = (Taro as any).requestSubscribeMessage
      if (typeof requestSubscribeMessage !== 'function') {
        throw new Error('当前基础库不支持订阅消息，请升级微信后重试')
      }
      const result = await requestSubscribeMessage({ tmplIds: [vaccineTemplateId] })
      const status = result?.[vaccineTemplateId] || 'unknown'
      await notificationApi.saveSubscriptions({ [vaccineTemplateId]: status })
      void trackEvent('subscription_prompt_result', { template: 'vaccine', status })
      const latestStatus = await notificationApi.getStatus().catch(() => null)
      if (latestStatus?.data?.state) setVaccineState(latestStatus.data.state)
      if (status === 'accept') {
        if (!latestStatus?.data?.state) setVaccineState('active')
        Taro.showToast({ title: '接种提醒已开启', icon: 'success' })
      } else if (status === 'reject') {
        Taro.showToast({ title: '暂未开启接种提醒', icon: 'none' })
      }
    } catch (error: any) {
      const errorMessage = error?.errMsg || error?.message || 'unknown'
      console.error('requestSubscribeMessage failed', error)
      if (errorMessage.includes('cancel')) {
        Taro.showToast({ title: '已取消提醒授权', icon: 'none' })
      } else {
        await Taro.showModal({
          title: '提醒授权失败',
          content: errorMessage,
          showCancel: false,
          confirmText: '知道了',
        })
      }
      void trackEvent('subscription_prompt_result', { template: 'vaccine', status: 'error' })
    } finally {
      requestingSubscriptionRef.current = false
    }
  }

  const baby = currentBaby || useBabyStore.getState().currentBaby
  if (!baby) {
    return (
      <View className="timeline-page timeline-empty">
        <Text className="empty-icon">💉</Text>
        <Text className="empty-title">先添加宝宝信息</Text>
        <Text className="empty-desc">填写出生日期后，即可查看月龄疫苗参考时间轴</Text>
      </View>
    )
  }

  const age = calculateAge(baby.birthday)
  const currentItems = getCurrentVaccineStage(age.months)
  const currentStageAge = currentItems[0]?.ageMonths ?? Number.MAX_SAFE_INTEGER
  const recordByScheduleItem = new Map(records
    .filter((record) => record.vaccineScheduleItemId)
    .map((record) => [record.vaccineScheduleItemId as string, record]))
  const matchedRecordIds = new Set(Array.from(recordByScheduleItem.values()).map((record) => record.id))
  const customRecords = records.filter((record) => !matchedRecordIds.has(record.id))

  const goToRecord = (item: VaccineScheduleItem) => {
    Taro.navigateTo({
      url: `/pages/record/index?type=vaccine&babyId=${baby.id}&scheduleItemId=${item.id}`,
    })
  }

  const updateVaccinePlan = async (item: VaccineScheduleItem, scheduledDate: string) => {
    try {
      await notificationApi.setVaccinePlan(baby.id, item.id, scheduledDate)
      const referenceDate = vaccinePlans[item.id]?.referenceDate || getVaccineReferenceDate(baby.birthday, item.ageMonths)
      setVaccinePlans((plans) => ({
        ...plans,
        [item.id]: {
          scheduleItemId: item.id,
          label: item.displayName,
          referenceDate,
          scheduledDate,
          effectiveDate: scheduledDate,
          completed: false,
          actualDate: null,
        },
      }))
      Taro.showToast({ title: '计划日期已设置', icon: 'success' })
    } catch (error) {
      console.error('set vaccine plan failed', error)
    }
  }

  const resetVaccinePlan = async (item: VaccineScheduleItem) => {
    const result = await Taro.showModal({
      title: '恢复参考日期',
      content: `将按${formatVaccineDate(vaccinePlans[item.id]?.referenceDate || getVaccineReferenceDate(baby.birthday, item.ageMonths))}计算提醒，确定恢复吗？`,
      confirmText: '恢复',
    })
    if (!result.confirm) return
    try {
      await notificationApi.removeVaccinePlan(baby.id, item.id)
      setVaccinePlans((plans) => {
        const next = { ...plans }
        delete next[item.id]
        return next
      })
      Taro.showToast({ title: '已恢复参考日期', icon: 'success' })
    } catch (error) {
      console.error('reset vaccine plan failed', error)
    }
  }

  const handleRecordAction = async (record: VaccineRecord) => {
    try {
      const action = await Taro.showActionSheet({ itemList: ['编辑', '删除'] })
      if (action.tapIndex === 0) {
        Taro.navigateTo({ url: `/pages/record/index?type=vaccine&babyId=${baby.id}&id=${record.id}` })
        return
      }
      if (action.tapIndex === 1) {
        const confirm = await Taro.showModal({
          title: '删除接种记录',
          content: `确定删除“${record.vaccineName || '这条疫苗'}”的接种记录吗？`,
        })
        if (!confirm.confirm) return
        await recordApi.delete(record.id)
        Taro.showToast({ title: '已删除', icon: 'success' })
        await loadData()
      }
    } catch (error) {
      // 用户取消 action sheet 时，微信会以 reject 结束，不提示错误。
      if (error?.errMsg && !error.errMsg.includes('cancel')) {
        Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    }
  }

  return (
    <View className="timeline-page">
      <View className="timeline-hero">
        <Text className="timeline-baby-name">{baby.name}</Text>
        <Text className="timeline-age">{age.months}个月{age.days}天</Text>
        <Image className="timeline-hero-art" src={vaccineRattle} mode="aspectFit" />
        <View className="timeline-current-stage">
          <Text className="timeline-current-label">当前关注阶段</Text>
          <Text className="timeline-current-value">
            {currentItems[0]?.ageLabel || '常规接种阶段'}
          </Text>
        </View>
      </View>

      <View className="timeline-disclaimer">
        <Text>本时间轴为国家免疫规划常规接种参考，品种、联合疫苗替代及补种安排请以接种门诊和接种证为准。</Text>
      </View>

      <Button className={`reminder-entry ${vaccineState === 'active' ? ' enabled' : vaccineState === 'exhausted' ? ' expired' : ' off'}`} onClick={requestVaccineSubscription}>
        <Image className="reminder-bell" src={bellIcon} />
        <View className="reminder-copy">
          <Text className="reminder-title">{vaccineState === 'active' ? '疫苗提醒已订阅' : vaccineState === 'exhausted' ? '提醒次数已用完' : '开启接种提醒'}</Text>
          <Text className="reminder-desc">{vaccineState === 'active' ? '还有可用提醒次数' : vaccineState === 'exhausted' ? '重新授权可再获得 1 次接种提醒' : '每次订阅可获得 1 次接种提醒，临近参考接种日时通知'}</Text>
        </View>
        <View className="reminder-pill">
          <Text className="reminder-pill-text">{vaccineState === 'active' ? '已订阅' : vaccineState === 'exhausted' ? '再次订阅' : '去开启'}</Text>
        </View>
      </Button>

      {loading ? (
        <View className="timeline-loading"><Text>加载中...</Text></View>
      ) : (
        <View className="timeline-list">
          {ageGroups.map((ageMonths) => {
            const items = VACCINE_SCHEDULE.filter((item) => item.ageMonths === ageMonths)
            const isCurrent = items.some((item) => currentItems.some((current) => current.id === item.id))
            // 走过的阶段节点用粉色标记，未到的保持灰色
            const groupState = isCurrent ? 'current' : ageMonths < currentStageAge ? 'past' : 'future'
            return (
              <View key={ageMonths} className={`timeline-group ${groupState}`}>
                <View className="timeline-marker"><View className="timeline-dot" /></View>
                <View className="timeline-content">
                  <View className="timeline-group-title">
                    <Text>{items[0].ageLabel}</Text>
                    {isCurrent && <Text className="current-badge">当前阶段</Text>}
                  </View>
                  {items.map((item) => {
                    const record = recordByScheduleItem.get(item.id)
                    const plan = vaccinePlans[item.id]
                    const referenceDate = plan?.referenceDate || getVaccineReferenceDate(baby.birthday, item.ageMonths)
                    const effectiveDate = plan?.scheduledDate || referenceDate
                    const pickerValue = effectiveDate < formatDate(new Date()) ? formatDate(new Date()) : effectiveDate
                    return (
                      <View key={item.id} className={`vaccine-item${record ? ' completed' : ''}`} onClick={() => record ? handleRecordAction(record) : goToRecord(item)}>
                        <View className="vaccine-item-main">
                          <Text className="vaccine-name">{item.displayName}</Text>
                          {item.note && <Text className="vaccine-note">{item.note}</Text>}
                          {record ? (
                            <Text className="vaccine-record-info">
                              已记录 {formatDate(record.startTime)}{record.vaccineHospital ? ` · ${record.vaccineHospital}` : ''}
                            </Text>
                          ) : (
                            <Text className="vaccine-ref-date">
                              {plan?.scheduledDate ? '计划接种' : '参考接种'} {formatVaccineDate(effectiveDate)}
                            </Text>
                          )}
                        </View>
                        {!record && (
                          <View className="vaccine-actions" onClick={(event) => event.stopPropagation()}>
                            <Picker
                              mode="date"
                              value={pickerValue}
                              start={formatDate(new Date())}
                              onChange={(event) => void updateVaccinePlan(item, event.detail.value as string)}
                            >
                              <View className={`vaccine-set-date${plan?.scheduledDate ? ' custom' : ''}`}>
                                <Image className="vaccine-set-date-icon" src={calendarIcon} />
                                <Text className="vaccine-set-date-text">{plan?.scheduledDate ? '修改日期' : '设置日期'}</Text>
                              </View>
                            </Picker>
                            {plan?.scheduledDate && (
                              <Text className="vaccine-plan-reset" onClick={() => void resetVaccinePlan(item)}>恢复参考</Text>
                            )}
                          </View>
                        )}
                        <Text className={`vaccine-record-link${record ? ' done' : ''}`}>
                          {record ? '管理记录 ›' : '记录接种 ›'}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>
      )}

      {customRecords.length > 0 && (
        <View className="custom-records">
          <Text className="custom-records-title">其他已记录疫苗</Text>
          {customRecords.map((record) => (
            <View key={record.id} className="custom-record-item" onClick={() => handleRecordAction(record)}>
              <Text>{record.vaccineName || '未命名疫苗'}</Text>
              <Text>{formatDate(record.startTime)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
