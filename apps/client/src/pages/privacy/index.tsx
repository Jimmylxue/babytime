import { View, Text } from '@tarojs/components';
import '../agreement/index.scss';

export default function PrivacyPage() {
  return (
    <View className="privacy-page">
      <View className="privacy-header">
        <Text className="privacy-title">《小宝贝日记》隐私政策</Text>
        <Text className="privacy-update">更新日期：2026年5月1日</Text>
      </View>

      <View className="privacy-body">
        <Text className="section-text">
          "小宝贝日记"小程序（以下简称"本应用"）非常重视用户的隐私保护。本隐私政策旨在向您说明我们如何收集、使用、存储和保护您的个人信息。请您在使用本应用前仔细阅读本隐私政策。
        </Text>

        <Text className="section-title">一、我们收集的信息</Text>
        <Text className="section-text">
          在您使用本应用时，我们可能会收集以下信息：
        </Text>
        <Text className="section-text">
          1. 微信授权信息：当您使用微信登录时，我们会获取您的微信昵称、头像等公开信息，用于创建和管理您的账号。
        </Text>
        <Text className="section-text">
          2. 您主动填写的信息：包括宝宝的昵称、出生日期、性别等基本信息，用于提供个性化服务。
        </Text>
        <Text className="section-text">
          3. 您记录的内容：包括喂养记录、睡眠记录、换尿布记录、身高等成长数据、照片等，这些是本应用核心功能所需的必要数据。
        </Text>
        <Text className="section-text">
          4. 设备信息：我们可能会收集设备型号、操作系统版本等基本设备信息，用于优化应用体验和问题排查。
        </Text>

        <Text className="section-title">二、我们如何使用信息</Text>
        <Text className="section-text">
          我们收集的信息将用于以下目的：
        </Text>
        <Text className="section-text">
          1. 提供核心服务：存储和管理您记录的宝宝成长数据，为您提供数据统计和分析功能。
        </Text>
        <Text className="section-text">
          2. 改进服务体验：通过分析使用数据，优化应用功能和用户体验。
        </Text>
        <Text className="section-text">
          3. 保障账号安全：用于身份验证、安全防护和客户服务。
        </Text>

        <Text className="section-title">三、信息存储与安全</Text>
        <Text className="section-text">
          1. 存储位置：您的数据存储在中国境内的服务器上。
        </Text>
        <Text className="section-text">
          2. 存储期限：我们会在实现服务目的所必需的期限内保留您的个人信息。当您注销账号后，我们将在合理期限内删除您的个人信息。
        </Text>
        <Text className="section-text">
          3. 安全措施：我们采用业界标准的安全技术和管理措施保护您的个人信息，包括数据加密、访问控制等，防止数据遭到未经授权的访问、泄露、篡改或丢失。
        </Text>

        <Text className="section-title">四、信息共享与披露</Text>
        <Text className="section-text">
          我们不会向第三方共享、转让或披露您的个人信息，但以下情况除外：
        </Text>
        <Text className="section-text">
          1. 获得您的明确同意或授权；
        </Text>
        <Text className="section-text">
          2. 根据法律法规的要求或政府主管部门的强制性要求；
        </Text>
        <Text className="section-text">
          3. 为维护本应用及其关联公司、合作伙伴或公众的合法权益所必需。
        </Text>

        <Text className="section-title">五、您的权利</Text>
        <Text className="section-text">
          您对您的个人信息享有以下权利：
        </Text>
        <Text className="section-text">
          1. 查看和更正：您可以随时查看和更正您在本应用中的个人信息。
        </Text>
        <Text className="section-text">
          2. 删除：您可以删除您记录的内容。如需删除全部个人信息，您可以通过注销账号实现。
        </Text>
        <Text className="section-text">
          3. 注销账号：您可以通过本应用内的"注销账号"功能注销您的账号。注销后，您的所有数据将被永久删除且无法恢复。
        </Text>
        <Text className="section-text">
          4. 撤回同意：您可以通过关闭相关权限或联系我们撤回对个人信息处理的同意。
        </Text>

        <Text className="section-title">六、未成年人保护</Text>
        <Text className="section-text">
          本应用的使用者为成年人（宝宝的监护人）。我们不会主动收集未成年人的个人信息。如果您是未成年人，请在监护人的指导下使用本应用。
        </Text>

        <Text className="section-title">七、隐私政策的变更</Text>
        <Text className="section-text">
          我们可能会适时修订本隐私政策。当隐私政策发生变更时，我们会在本应用中发布更新后的隐私政策。如您继续使用本应用，即表示您同意接受修订后的隐私政策。
        </Text>

        <Text className="section-title">八、联系我们</Text>
        <Text className="section-text">
          如果您对本隐私政策有任何疑问、意见或建议，请通过本应用内的反馈功能与我们联系。我们将在合理期限内回复您的请求。
        </Text>
      </View>
    </View>
  );
}
