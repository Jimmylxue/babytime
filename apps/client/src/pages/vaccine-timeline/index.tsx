import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { recordApi, notificationApi, trackEvent } from '../../utils/request'
import { calculateAge, formatDate } from '../../utils/date'
import { getCurrentVaccineStage, VACCINE_SCHEDULE, VaccineScheduleItem } from '../../utils/vaccineSchedule'
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

export default function VaccineTimelinePage() {
  const { isLoggedIn } = useAuthStore()
  const { currentBaby } = useBabyStore()
  const [records, setRecords] = useState<VaccineRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(() => Boolean(Taro.getStorageSync('subscription:vaccine:accepted')))
  const [vaccineTemplateId, setVaccineTemplateId] = useState('')
  const requestingSubscriptionRef = useRef(false)
  const notificationTrackedRef = useRef(false)

  const loadData = async () => {
    if (!isLoggedIn) return
    try {
      setLoading(true)
      await useBabyStore.getState().fetchBabies()
      const baby = useBabyStore.getState().currentBaby
      if (!baby) return
      const res = await recordApi.getVaccines(baby.id)
      setRecords(res.data || [])
    } catch (error) {
      Taro.showToast({ title: '加载疫苗记录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    setReminderEnabled(Boolean(Taro.getStorageSync('subscription:vaccine:accepted')))
    loadData()
    notificationApi.getConfig().then((res) => {
      setVaccineTemplateId(res.data?.vaccineEnabled ? res.data.vaccineTemplateId : '')
    }).catch(() => setVaccineTemplateId(''))
    const source = Taro.getCurrentInstance().router?.params?.source
    if (isLoggedIn && !notificationTrackedRef.current && source === 'notification_vaccine') {
      notificationTrackedRef.current = true
      void trackEvent('notification_open', { source })
    }
  })

  const requestVaccineSubscription = async () => {
    if (requestingSubscriptionRef.current) return
    if (!vaccineTemplateId) {
      Taro.showToast({ title: '提醒服务暂未配置', icon: 'none' })
      return
    }
    requestingSubscriptionRef.current = true
    try {
      const promptKey = `subscription:vaccine:last-prompt:v2:${new Date().toISOString().slice(0, 10)}`
      if (Taro.getStorageSync(promptKey)) {
        Taro.showToast({ title: '今天已请求过提醒授权', icon: 'none' })
        return
      }
      // 必须在用户点击回调中直接调用，不能先 await 网络请求，否则微信不会弹授权框。
      const requestSubscribeMessage = (Taro as any).requestSubscribeMessage
      if (typeof requestSubscribeMessage !== 'function') {
        throw new Error('当前基础库不支持订阅消息，请升级微信后重试')
      }
      const result = await requestSubscribeMessage({ tmplIds: [vaccineTemplateId] })
      Taro.setStorageSync(promptKey, true)
      const status = result?.[vaccineTemplateId] || 'unknown'
      await notificationApi.saveSubscriptions({ [vaccineTemplateId]: status })
      void trackEvent('subscription_prompt_result', { template: 'vaccine', status })
      if (status === 'accept') {
        Taro.setStorageSync('subscription:vaccine:accepted', true)
        setReminderEnabled(true)
        Taro.showToast({ title: '接种提醒已开启', icon: 'success' })
      } else if (status === 'reject') {
        Taro.removeStorageSync('subscription:vaccine:accepted')
        setReminderEnabled(false)
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

      <Button className={`reminder-entry${reminderEnabled ? ' enabled' : ''}`} onClick={requestVaccineSubscription}>
        <View>
          <Text className="reminder-title">{reminderEnabled ? '接种提醒已开启' : '开启接种提醒'}</Text>
          <Text className="reminder-desc">临近参考接种日时通过微信服务通知提醒</Text>
        </View>
        <Text className="reminder-action">{reminderEnabled ? '已开启' : '去开启'}</Text>
      </Button>

      {loading ? (
        <View className="timeline-loading"><Text>加载中...</Text></View>
      ) : (
        <View className="timeline-list">
          {ageGroups.map((ageMonths) => {
            const items = VACCINE_SCHEDULE.filter((item) => item.ageMonths === ageMonths)
            const isCurrent = items.some((item) => currentItems.some((current) => current.id === item.id))
            return (
              <View key={ageMonths} className={`timeline-group${isCurrent ? ' current' : ''}`}>
                <View className="timeline-marker"><View className="timeline-dot" /></View>
                <View className="timeline-content">
                  <View className="timeline-group-title">
                    <Text>{items[0].ageLabel}</Text>
                    {isCurrent && <Text className="current-badge">当前阶段</Text>}
                  </View>
                  {items.map((item) => {
                    const record = recordByScheduleItem.get(item.id)
                    return (
                      <View key={item.id} className={`vaccine-item${record ? ' completed' : ''}`} onClick={() => record ? handleRecordAction(record) : goToRecord(item)}>
                        <View className="vaccine-item-main">
                          <Text className="vaccine-name">{item.displayName}</Text>
                          {item.note && <Text className="vaccine-note">{item.note}</Text>}
                          {record && (
                            <Text className="vaccine-record-info">
                              已记录 {formatDate(record.startTime)}{record.vaccineHospital ? ` · ${record.vaccineHospital}` : ''}
                            </Text>
                          )}
                        </View>
                        <Text className={`vaccine-status${record ? ' done' : ''}`}>{record ? '管理记录' : '记录接种'}</Text>
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
